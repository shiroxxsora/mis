package com.mis.servicelogic.service;

import com.mis.servicelogic.dto.AppointmentStatusValue;

import java.util.Map;
import java.util.Set;

public final class AppointmentStatusTransitions {

    private static final Map<String, Set<String>> ALLOWED = Map.of(
            "scheduled", Set.of("arrived", "no_show", "cancelled"),
            "arrived", Set.of("completed", "cancelled", "no_show"),
            "no_show", Set.of("arrived", "completed", "cancelled"),
            "completed", Set.of(),
            "cancelled", Set.of()
    );

    private AppointmentStatusTransitions() {
    }

    public static void validateTransition(String currentStatus, String nextStatus) {
        if (currentStatus == null || currentStatus.isBlank()) {
            throw new IllegalArgumentException("Текущий статус приёма неизвестен");
        }
        if (!AppointmentStatusValue.isAllowed(currentStatus)) {
            throw new IllegalArgumentException("Недопустимый текущий статус приёма: " + currentStatus);
        }
        if (nextStatus == null || nextStatus.isBlank()) {
            throw new IllegalArgumentException("Новый статус приёма не указан");
        }
        if (!AppointmentStatusValue.isAllowed(nextStatus)) {
            throw new IllegalArgumentException("Недопустимый статус приёма: " + nextStatus);
        }
        if (currentStatus.equals(nextStatus)) {
            return;
        }
        Set<String> allowed = ALLOWED.getOrDefault(currentStatus, Set.of());
        if (!allowed.contains(nextStatus)) {
            throw new IllegalArgumentException(
                    "Недопустимый переход статуса: " + currentStatus + " → " + nextStatus);
        }
    }
}
