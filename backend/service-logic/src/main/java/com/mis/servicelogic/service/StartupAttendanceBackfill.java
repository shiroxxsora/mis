package com.mis.servicelogic.service;

import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.client.HasuraClient.PatientAttendanceSnapshot;
import com.mis.servicelogic.client.LlmClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class StartupAttendanceBackfill {

    private static final Logger log = LoggerFactory.getLogger(StartupAttendanceBackfill.class);

    private final HasuraClient hasuraClient;
    private final LlmClient llmClient;
    private final boolean enabled;
    private final int patientsLimit;
    private final int appointmentsLimit;

    public StartupAttendanceBackfill(
            HasuraClient hasuraClient,
            LlmClient llmClient,
            @Value("${mis.attendance-backfill.enabled:true}") boolean enabled,
            @Value("${mis.attendance-backfill.patients-limit:25}") int patientsLimit,
            @Value("${mis.attendance-backfill.appointments-limit:10}") int appointmentsLimit
    ) {
        this.hasuraClient = hasuraClient;
        this.llmClient = llmClient;
        this.enabled = enabled;
        this.patientsLimit = patientsLimit;
        this.appointmentsLimit = appointmentsLimit;
    }

    @Async
    @EventListener(ApplicationReadyEvent.class)
    public void runBackfill() {
        if (!enabled) {
            log.info("Startup attendance backfill disabled");
            return;
        }

        List<PatientAttendanceSnapshot> patients;
        try {
            patients = hasuraClient.findPatientsMissingAttendanceProbability(patientsLimit, appointmentsLimit);
        } catch (Exception e) {
            log.warn("Startup attendance backfill skipped: unable to read patients from Hasura ({})", e.getMessage());
            return;
        }
        if (patients.isEmpty()) {
            log.info("Startup attendance backfill: no patients with missing attendance_probability");
            return;
        }

        int updated = 0;
        int failed = 0;
        for (PatientAttendanceSnapshot patient : patients) {
            if (patient.appointments() == null || patient.appointments().isEmpty()) {
                continue;
            }

            try {
                String input = AttendanceInputBuilder.build(patient.appointments());
                int probability = llmClient.predictAttendanceProbability(input);
                hasuraClient.updatePatientAttendanceProbability(patient.patientId(), probability);
                updated++;
                log.info(
                        "Startup attendance backfill: patientId={} updated to {}%",
                        patient.patientId(),
                        probability
                );
            } catch (Exception e) {
                failed++;
                log.warn(
                        "Startup attendance backfill: failed for patientId={} ({})",
                        patient.patientId(),
                        e.getMessage()
                );
            }
        }

        log.info(
                "Startup attendance backfill finished: totalCandidates={}, updated={}, failed={}",
                patients.size(),
                updated,
                failed
        );
    }
}
