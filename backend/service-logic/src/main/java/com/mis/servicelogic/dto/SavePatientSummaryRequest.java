package com.mis.servicelogic.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SavePatientSummaryRequest(@NotBlank @Size(max = 10000) String summary) {
}
