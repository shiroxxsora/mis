package com.mis.servicelogic.controller;

import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.dto.PatientRecognitionResponse;
import com.mis.servicelogic.dto.SavePatientRecognitionRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/patients")
public class PatientRecognitionController {

    private final HasuraClient hasuraClient;

    public PatientRecognitionController(HasuraClient hasuraClient) {
        this.hasuraClient = hasuraClient;
    }

    @GetMapping("/{patientId}/recognitions")
    public ResponseEntity<List<PatientRecognitionResponse>> list(@PathVariable int patientId) {
        try {
            hasuraClient.requirePatientExists(patientId);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(NOT_FOUND, ex.getMessage(), ex);
        }
        return ResponseEntity.ok(
                hasuraClient.listPatientRecognitions(patientId).stream()
                        .map(this::toResponse)
                        .toList());
    }

    @PostMapping("/{patientId}/recognitions")
    public ResponseEntity<PatientRecognitionResponse> save(
            @PathVariable int patientId,
            @Valid @RequestBody SavePatientRecognitionRequest request) {
        try {
            hasuraClient.requirePatientExists(patientId);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(NOT_FOUND, ex.getMessage(), ex);
        }
        if (request.patientImageId() != null) {
            HasuraClient.PatientImageRecord image = hasuraClient.findPatientImage(request.patientImageId());
            if (image == null || image.patientId() != patientId) {
                throw new ResponseStatusException(NOT_FOUND, "Снимок не найден у пациента");
            }
        }

        HasuraClient.PatientRecognitionRecord saved = hasuraClient.insertPatientRecognition(
                patientId,
                request.patientImageId(),
                request.status().trim(),
                request.message().trim(),
                blankToNull(request.jobId()),
                blankToNull(request.label()),
                request.confidence(),
                request.probHealthy(),
                blankToNull(request.shapImageBase64()),
                blankToNull(request.limeImageBase64()));

        return ResponseEntity.ok(toResponse(saved));
    }

    private PatientRecognitionResponse toResponse(HasuraClient.PatientRecognitionRecord record) {
        return new PatientRecognitionResponse(
                record.id(),
                record.patientId(),
                record.patientImageId(),
                imageDownloadUrl(record.patientImageId()),
                record.status(),
                record.message(),
                record.jobId(),
                record.label(),
                record.confidence(),
                record.probHealthy(),
                record.shapImageBase64(),
                record.limeImageBase64(),
                record.createdAt());
    }

    private static String imageDownloadUrl(Integer patientImageId) {
        return patientImageId == null ? null : "/api/patients/images/" + patientImageId + "/file";
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
