package com.mis.servicelogic.service;

import com.mis.servicelogic.client.HasuraClient.AppointmentSnapshot;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AttendanceInputBuilderTest {

    @Test
    void build_mapsStatusAndDefaults() {
        List<AppointmentSnapshot> appointments = List.of(
                new AppointmentSnapshot(
                        "2026-05-27T06:20:00Z",
                        "no_show",
                        null,
                        "Обследование",
                        false
                )
        );

        String input = AttendanceInputBuilder.build(appointments);

        assertThat(input).contains("Статус: Не явился");
        assertThat(input).contains("Жалобы: нет");
        assertThat(input).contains("Заметки: Обследование");
        assertThat(input).contains("Лечение: нет");
    }

    @Test
    void build_emptyHistory() {
        String input = AttendanceInputBuilder.build(List.of());
        assertThat(input).contains("История приёмов отсутствует.");
    }

    @Test
    void build_ignoresScheduledAppointments() {
        List<AppointmentSnapshot> appointments = List.of(
                new AppointmentSnapshot(
                        "2026-05-28T10:00:00Z",
                        "scheduled",
                        "Будущий приём",
                        null,
                        false
                ),
                new AppointmentSnapshot(
                        "2026-05-27T06:20:00Z",
                        "arrived",
                        null,
                        "Осмотр",
                        true
                )
        );

        String input = AttendanceInputBuilder.build(appointments);

        assertThat(input).contains("Статус: Явился");
        assertThat(input).doesNotContain("Будущий приём");
        assertThat(input).doesNotContain("Запланирован");
    }
}
