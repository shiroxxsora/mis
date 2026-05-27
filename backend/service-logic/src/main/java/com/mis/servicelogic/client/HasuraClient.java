package com.mis.servicelogic.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.mis.servicelogic.config.HasuraProperties;
import com.mis.servicelogic.exception.AppointmentConflictException;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Component
public class HasuraClient {

    private final RestClient restClient;
    private final HasuraProperties properties;

    public HasuraClient(HasuraProperties properties) {
        this.properties = properties;
        String hasuraUrl = normalizeHasuraUrl(properties.url());
        this.restClient = RestClient.builder()
                .baseUrl(hasuraUrl)
                .defaultHeader("x-hasura-admin-secret", properties.adminSecret())
                .build();
    }

    public void updatePatientAttendanceProbability(int patientId, int probability) {
        requirePatientExists(patientId);

        String query = """
                mutation UpdatePatientAttendance($id: Int!, $attendance_probability: smallint!) {
                  update_patients_by_pk(
                    pk_columns: { id: $id }
                    _set: { attendance_probability: $attendance_probability }
                  ) {
                    id
                  }
                }
                """;

        execute(query, Map.of(
                "id", patientId,
                "attendance_probability", probability
        ));
    }

    public void savePatientSummary(int patientId, String summary) {
        requirePatientExists(patientId);

        String query = """
                mutation SavePatientSummary($patient_id: Int!, $summary: String!) {
                  insert_patient_summaries_one(object: { patient_id: $patient_id, summary: $summary }) {
                    id
                  }
                  update_patients_by_pk(
                    pk_columns: { id: $patient_id }
                    _set: { visit_summary: $summary }
                  ) {
                    id
                  }
                }
                """;

        execute(query, Map.of(
                "patient_id", patientId,
                "summary", summary
        ));
    }

    public void requirePatientExists(int patientId) {
        if (!patientExists(patientId)) {
            throw new IllegalArgumentException("Пациент не найден: " + patientId);
        }
    }

    public boolean patientExists(int patientId) {
        String query = """
                query PatientExists($id: Int!) {
                  patients_by_pk(id: $id) {
                    id
                  }
                }
                """;

        JsonNode body = executeForBody(query, Map.of("id", patientId));
        JsonNode row = body.path("data").path("patients_by_pk");
        return !row.isMissingNode() && !row.isNull();
    }

    public AppointmentRecord findAppointmentById(int appointmentId) {
        String query = """
                query AppointmentById($id: Int!) {
                  appointments_by_pk(id: $id) {
                    id
                    patient_id
                    status
                    complaints
                    notes
                    treatment_done
                  }
                }
                """;

        JsonNode body = executeForBody(query, Map.of("id", appointmentId));
        JsonNode row = body.path("data").path("appointments_by_pk");
        if (row.isMissingNode() || row.isNull()) {
            return null;
        }
        return new AppointmentRecord(
                row.path("id").asInt(),
                row.path("patient_id").asInt(),
                row.path("status").asText(""),
                nullableText(row, "complaints"),
                nullableText(row, "notes"),
                row.path("treatment_done").asBoolean(false)
        );
    }

    public void processAppointment(
            int appointmentId,
            String status,
            String complaints,
            String notes,
            boolean treatmentDone) {
        AppointmentRecord current = findAppointmentById(appointmentId);
        if (current == null) {
            throw new IllegalArgumentException("Приём не найден: " + appointmentId);
        }

        com.mis.servicelogic.service.AppointmentStatusTransitions.validateTransition(
                current.status(),
                status
        );

        String query = """
                mutation ProcessAppointment(
                  $id: Int!
                  $expected_status: String!
                  $status: String!
                  $complaints: String
                  $notes: String
                  $treatment_done: Boolean!
                ) {
                  update_appointments(
                    where: {
                      id: { _eq: $id }
                      status: { _eq: $expected_status }
                    }
                    _set: {
                      status: $status
                      complaints: $complaints
                      notes: $notes
                      treatment_done: $treatment_done
                    }
                  ) {
                    affected_rows
                  }
                }
                """;

        Map<String, Object> variables = new java.util.HashMap<>();
        variables.put("id", appointmentId);
        variables.put("expected_status", current.status());
        variables.put("status", status);
        variables.put("complaints", complaints);
        variables.put("notes", notes);
        variables.put("treatment_done", treatmentDone);
        JsonNode body = executeForBody(query, variables);
        int affectedRows = body.path("data").path("update_appointments").path("affected_rows").asInt(0);
        if (affectedRows == 0) {
            throw new AppointmentConflictException(
                    "Приём был изменён другим пользователем. Обновите данные и повторите сохранение.");
        }
    }

    public void cancelAppointment(int appointmentId) {
        AppointmentRecord current = findAppointmentById(appointmentId);
        if (current == null) {
            throw new IllegalArgumentException("Приём не найден: " + appointmentId);
        }
        processAppointment(
                appointmentId,
                "cancelled",
                current.complaints(),
                current.notes(),
                current.treatmentDone()
        );
    }

    public List<PatientAttendanceSnapshot> findPatientsMissingAttendanceProbability(int patientsLimit, int appointmentsLimit) {
        String query = """
                query PatientsMissingAttendanceProbability($patients_limit: Int!, $appointments_limit: Int!) {
                  patients(
                    where: {
                      attendance_probability: { _is_null: true }
                      appointments: { id: { _is_null: false } }
                    }
                    order_by: { id: asc }
                    limit: $patients_limit
                  ) {
                    id
                    appointments(order_by: { scheduled_at: desc }, limit: $appointments_limit) {
                      scheduled_at
                      status
                      complaints
                      notes
                      treatment_done
                    }
                  }
                }
                """;

        JsonNode body = executeForBody(query, Map.of(
                "patients_limit", patientsLimit,
                "appointments_limit", appointmentsLimit
        ));
        JsonNode rows = body.path("data").path("patients");
        if (!rows.isArray()) {
            return Collections.emptyList();
        }

        List<PatientAttendanceSnapshot> result = new ArrayList<>();
        for (JsonNode row : rows) {
            int patientId = row.path("id").asInt();
            JsonNode appointmentsNode = row.path("appointments");
            List<AppointmentSnapshot> appointments = new ArrayList<>();
            if (appointmentsNode.isArray()) {
                for (JsonNode appointment : appointmentsNode) {
                    appointments.add(new AppointmentSnapshot(
                            appointment.path("scheduled_at").asText(""),
                            appointment.path("status").asText(""),
                            nullableText(appointment, "complaints"),
                            nullableText(appointment, "notes"),
                            appointment.path("treatment_done").asBoolean(false)
                    ));
                }
            }
            result.add(new PatientAttendanceSnapshot(patientId, appointments));
        }

        return result;
    }

    private void execute(String query, Map<String, Object> variables) {
        executeForBody(query, variables);
    }

    private JsonNode executeForBody(String query, Map<String, Object> variables) {
        Map<String, Object> payload = Map.of(
                "query", query,
                "variables", variables
        );

        JsonNode body = restClient.post()
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(JsonNode.class);

        if (body == null) {
            throw new IllegalStateException("Пустой ответ Hasura");
        }
        if (body.has("errors") && body.get("errors").isArray() && !body.get("errors").isEmpty()) {
            throw new IllegalStateException(body.get("errors").toString());
        }
        return body;
    }

    private static String nullableText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.asText();
    }

    private static String normalizeHasuraUrl(String url) {
        if (url == null || url.isBlank()) {
            return "http://hasura-graphql-engine:8080/v1/graphql";
        }
        String trimmed = url.trim();
        if (trimmed.endsWith("/v1/graphql")) {
            return trimmed;
        }
        if (trimmed.endsWith("/")) {
            return trimmed + "v1/graphql";
        }
        return trimmed + "/v1/graphql";
    }

    public record AppointmentSnapshot(
            String scheduledAt,
            String status,
            String complaints,
            String notes,
            boolean treatmentDone
    ) {
    }

    public record PatientAttendanceSnapshot(int patientId, List<AppointmentSnapshot> appointments) {
    }

    public int insertPatientImage(
            int patientId,
            String type,
            String filePath,
            String takenAt,
            String toothNumber,
            String notes) {
        String query = """
                mutation InsertPatientImage(
                  $patient_id: Int!
                  $type: String!
                  $file_path: String!
                  $taken_at: timestamptz
                  $tooth_number: String
                  $notes: String
                ) {
                  insert_patient_images_one(object: {
                    patient_id: $patient_id
                    type: $type
                    file_path: $file_path
                    taken_at: $taken_at
                    tooth_number: $tooth_number
                    notes: $notes
                  }) {
                    id
                  }
                }
                """;

        Map<String, Object> variables = new java.util.HashMap<>();
        variables.put("patient_id", patientId);
        variables.put("type", type);
        variables.put("file_path", filePath);
        variables.put("taken_at", takenAt);
        variables.put("tooth_number", toothNumber);
        variables.put("notes", notes);

        JsonNode body = executeForBody(query, variables);
        return body.path("data").path("insert_patient_images_one").path("id").asInt();
    }

    public PatientImageRecord findPatientImage(int imageId) {
        String query = """
                query PatientImageById($id: Int!) {
                  patient_images_by_pk(id: $id) {
                    id
                    patient_id
                    type
                    file_path
                  }
                }
                """;

        JsonNode body = executeForBody(query, Map.of("id", imageId));
        JsonNode row = body.path("data").path("patient_images_by_pk");
        if (row.isMissingNode() || row.isNull()) {
            return null;
        }
        return new PatientImageRecord(
                row.path("id").asInt(),
                row.path("patient_id").asInt(),
                row.path("type").asText(),
                row.path("file_path").asText()
        );
    }

    public record PatientImageRecord(int id, int patientId, String type, String filePath) {
    }

    public PatientRecognitionRecord insertPatientRecognition(
            int patientId,
            Integer patientImageId,
            String status,
            String message,
            String jobId,
            String label,
            Double confidence,
            Double probHealthy,
            String shapImageBase64,
            String limeImageBase64) {
        String query = """
                mutation InsertPatientRecognition(
                  $patient_id: Int!
                  $patient_image_id: Int
                  $status: String!
                  $message: String!
                  $job_id: String
                  $label: String
                  $confidence: float8
                  $prob_healthy: float8
                  $shap_image_base64: String
                  $lime_image_base64: String
                ) {
                  insert_patient_recognition_results_one(object: {
                    patient_id: $patient_id
                    patient_image_id: $patient_image_id
                    status: $status
                    message: $message
                    job_id: $job_id
                    label: $label
                    confidence: $confidence
                    prob_healthy: $prob_healthy
                    shap_image_base64: $shap_image_base64
                    lime_image_base64: $lime_image_base64
                  }) {
                    id
                    patient_id
                    patient_image_id
                    status
                    message
                    job_id
                    label
                    confidence
                    prob_healthy
                    shap_image_base64
                    lime_image_base64
                    created_at
                  }
                }
                """;

        Map<String, Object> variables = new java.util.HashMap<>();
        variables.put("patient_id", patientId);
        variables.put("patient_image_id", patientImageId);
        variables.put("status", status);
        variables.put("message", message);
        variables.put("job_id", jobId);
        variables.put("label", label);
        variables.put("confidence", confidence);
        variables.put("prob_healthy", probHealthy);
        variables.put("shap_image_base64", shapImageBase64);
        variables.put("lime_image_base64", limeImageBase64);

        JsonNode body = executeForBody(query, variables);
        return parsePatientRecognition(body.path("data").path("insert_patient_recognition_results_one"));
    }

    public List<PatientRecognitionRecord> listPatientRecognitions(int patientId) {
        String query = """
                query PatientRecognitions($patient_id: Int!) {
                  patient_recognition_results(
                    where: { patient_id: { _eq: $patient_id } }
                    order_by: { created_at: desc }
                  ) {
                    id
                    patient_id
                    patient_image_id
                    status
                    message
                    job_id
                    label
                    confidence
                    prob_healthy
                    shap_image_base64
                    lime_image_base64
                    created_at
                  }
                }
                """;

        JsonNode body = executeForBody(query, Map.of("patient_id", patientId));
        JsonNode rows = body.path("data").path("patient_recognition_results");
        List<PatientRecognitionRecord> results = new java.util.ArrayList<>();
        if (!rows.isArray()) {
            return results;
        }
        for (JsonNode row : rows) {
            results.add(parsePatientRecognition(row));
        }
        return results;
    }

    private PatientRecognitionRecord parsePatientRecognition(JsonNode row) {
        if (row.isMissingNode() || row.isNull()) {
            throw new IllegalStateException("Пустой ответ Hasura для распознавания");
        }
        JsonNode imageId = row.path("patient_image_id");
        return new PatientRecognitionRecord(
                row.path("id").asInt(),
                row.path("patient_id").asInt(),
                imageId.isNull() ? null : imageId.asInt(),
                row.path("status").asText(),
                row.path("message").asText(),
                textOrNull(row.path("job_id")),
                textOrNull(row.path("label")),
                doubleOrNull(row.path("confidence")),
                doubleOrNull(row.path("prob_healthy")),
                textOrNull(row.path("shap_image_base64")),
                textOrNull(row.path("lime_image_base64")),
                row.path("created_at").asText());
    }

    private static String textOrNull(JsonNode node) {
        return node.isNull() || node.isMissingNode() ? null : node.asText();
    }

    private static Double doubleOrNull(JsonNode node) {
        return node.isNull() || node.isMissingNode() ? null : node.asDouble();
    }

    public record PatientRecognitionRecord(
            int id,
            int patientId,
            Integer patientImageId,
            String status,
            String message,
            String jobId,
            String label,
            Double confidence,
            Double probHealthy,
            String shapImageBase64,
            String limeImageBase64,
            String createdAt) {
    }

    public record AppointmentRecord(
            int id,
            int patientId,
            String status,
            String complaints,
            String notes,
            boolean treatmentDone
    ) {
    }
}
