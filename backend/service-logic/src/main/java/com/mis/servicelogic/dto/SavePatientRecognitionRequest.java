package com.mis.servicelogic.dto;

import jakarta.validation.constraints.NotBlank;

public record SavePatientRecognitionRequest(
        Integer patientImageId,
        @NotBlank String status,
        @NotBlank String message,
        String jobId,
        String label,
        Double confidence,
        Double probHealthy,
        String shapImageBase64,
        String limeImageBase64
) {
}
