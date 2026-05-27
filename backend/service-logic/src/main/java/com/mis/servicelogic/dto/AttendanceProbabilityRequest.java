package com.mis.servicelogic.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AttendanceProbabilityRequest(@NotBlank @Size(max = 50000) String input) {
}