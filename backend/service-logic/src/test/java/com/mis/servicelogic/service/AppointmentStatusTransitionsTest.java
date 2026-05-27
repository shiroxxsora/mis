package com.mis.servicelogic.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AppointmentStatusTransitionsTest {

    @ParameterizedTest
    @CsvSource({
            "scheduled, arrived",
            "scheduled, no_show",
            "arrived, completed",
            "no_show, arrived"
    })
    void validateTransition_allowsKnownTransitions(String current, String next) {
        AppointmentStatusTransitions.validateTransition(current, next);
    }

    @Test
    void validateTransition_rejectsCompletedToScheduled() {
        assertThatThrownBy(() -> AppointmentStatusTransitions.validateTransition("completed", "scheduled"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Недопустимый переход");
    }

    @Test
    void validateTransition_allowsSameStatus() {
        AppointmentStatusTransitions.validateTransition("arrived", "arrived");
    }
}
