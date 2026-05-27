package com.mis.servicelogic.dto;

import jakarta.validation.constraints.NotBlank;

public record RecognitionRequest(String source, @NotBlank String payload) {
}
