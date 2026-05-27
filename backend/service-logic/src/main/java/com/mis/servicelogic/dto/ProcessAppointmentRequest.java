package com.mis.servicelogic.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ProcessAppointmentRequest(
        @NotNull AppointmentStatusValue status,
        @Size(max = 5000) String complaints,
        @Size(max = 5000) String notes,
        @NotNull Boolean treatmentDone
) {
}
