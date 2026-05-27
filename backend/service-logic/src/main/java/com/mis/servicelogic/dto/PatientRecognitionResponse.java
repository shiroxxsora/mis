package com.mis.servicelogic.dto;

public record PatientRecognitionResponse(
        int id,
        int patientId,
        Integer patientImageId,
        String imageDownloadUrl,
        String status,
        String message,
        String jobId,
        String label,
        Double confidence,
        Double probHealthy,
        String shapImageBase64,
        String limeImageBase64,
        String createdAt
) {
}
