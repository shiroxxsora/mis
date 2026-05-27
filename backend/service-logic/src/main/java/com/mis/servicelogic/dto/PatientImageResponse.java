package com.mis.servicelogic.dto;

public record PatientImageResponse(
        int id,
        int patientId,
        String type,
        String filePath,
        String storageUri,
        String downloadUrl
) {
}
