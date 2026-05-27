package com.mis.servicelogic.service;

import com.mis.servicelogic.client.HasuraClient.AppointmentSnapshot;

import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class AttendanceInputBuilder {

    private static final DateTimeFormatter DATE_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("dd.MM.yyyy, HH:mm", new Locale("ru", "RU"));
    private static final Map<String, String> STATUS_LABELS = Map.of(
            "scheduled", "Запланирован",
            "arrived", "Явился",
            "no_show", "Не явился",
            "completed", "Завершён",
            "cancelled", "Отменён"
    );

    private AttendanceInputBuilder() {
    }

    public static String build(List<AppointmentSnapshot> appointments) {
        List<AppointmentSnapshot> historyAppointments = filterHistoryAppointments(appointments);
        if (historyAppointments.isEmpty()) {
            return "Оцени вероятность явки пациента на следующий запланированный приём.\n\nИстория приёмов отсутствует.";
        }

        StringBuilder history = new StringBuilder();
        for (int i = 0; i < historyAppointments.size(); i++) {
            AppointmentSnapshot appointment = historyAppointments.get(i);
            if (i > 0) {
                history.append("\n\n");
            }
            history.append("Дата: ").append(formatDate(appointment.scheduledAt())).append('\n')
                    .append("Статус: ").append(mapStatus(appointment.status())).append('\n')
                    .append("Жалобы: ").append(defaultText(appointment.complaints())).append('\n')
                    .append("Заметки: ").append(defaultText(appointment.notes())).append('\n')
                    .append("Лечение: ").append(appointment.treatmentDone() ? "да" : "нет");
        }

        return "Оцени вероятность явки пациента на следующий запланированный приём.\n\n" + history;
    }

    private static List<AppointmentSnapshot> filterHistoryAppointments(List<AppointmentSnapshot> appointments) {
        if (appointments == null || appointments.isEmpty()) {
            return List.of();
        }
        return appointments.stream()
                .filter(appointment -> appointment.status() != null && !"scheduled".equals(appointment.status()))
                .toList();
    }

    private static String defaultText(String value) {
        if (value == null || value.isBlank()) {
            return "нет";
        }
        return value;
    }

    private static String mapStatus(String status) {
        if (status == null || status.isBlank()) {
            return "Неизвестно";
        }
        return STATUS_LABELS.getOrDefault(status, status);
    }

    private static String formatDate(String isoDateTime) {
        if (isoDateTime == null || isoDateTime.isBlank()) {
            return "не указана";
        }
        try {
            return OffsetDateTime.parse(isoDateTime).format(DATE_TIME_FORMATTER);
        } catch (Exception e) {
            return isoDateTime;
        }
    }
}
