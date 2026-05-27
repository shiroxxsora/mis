package com.mis.servicelogic.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

public enum AppointmentStatusValue {
    SCHEDULED("scheduled"),
    ARRIVED("arrived"),
    NO_SHOW("no_show"),
    COMPLETED("completed"),
    CANCELLED("cancelled");

    private static final Set<String> ALLOWED = Arrays.stream(values())
            .map(AppointmentStatusValue::jsonValue)
            .collect(Collectors.toUnmodifiableSet());

    private final String jsonValue;

    AppointmentStatusValue(String jsonValue) {
        this.jsonValue = jsonValue;
    }

    @JsonValue
    public String jsonValue() {
        return jsonValue;
    }

    @JsonCreator
    public static AppointmentStatusValue fromJson(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("Статус приёма не указан");
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        for (AppointmentStatusValue value : values()) {
            if (value.jsonValue.equals(normalized)) {
                return value;
            }
        }
        throw new IllegalArgumentException("Недопустимый статус приёма: " + raw);
    }

    public static boolean isAllowed(String status) {
        return status != null && ALLOWED.contains(status.trim().toLowerCase(Locale.ROOT));
    }
}
