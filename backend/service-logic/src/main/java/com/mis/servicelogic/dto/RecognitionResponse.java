package com.mis.servicelogic.dto;

public record RecognitionResponse(
        String status,
        String message,
        String jobId,
        String label,
        Double confidence,
        Double probHealthy,
        String shapImageBase64,
        String limeImageBase64
) {
}
