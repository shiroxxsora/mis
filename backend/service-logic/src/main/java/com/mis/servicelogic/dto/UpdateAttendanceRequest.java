package com.mis.servicelogic.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateAttendanceRequest(
        @NotNull @Min(0) @Max(100) Integer probability
) {
}
