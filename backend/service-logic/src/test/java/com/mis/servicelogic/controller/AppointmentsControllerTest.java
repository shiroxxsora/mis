package com.mis.servicelogic.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.config.RecognitionExceptionHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = AppointmentsController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(RecognitionExceptionHandler.class)
class AppointmentsControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private HasuraClient hasuraClient;

    @BeforeEach
    void setUp() {
        // default: no stub needed, void method
    }

    @Test
    void process_validRequest_returns204() throws Exception {
        mockMvc.perform(put("/api/appointments/5/process")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "status": "completed",
                                  "complaints": "Боль",
                                  "notes": "Осмотр",
                                  "treatmentDone": true
                                }
                                """))
                .andExpect(status().isNoContent());

        verify(hasuraClient).processAppointment(
                eq(5),
                eq("completed"),
                eq("Боль"),
                eq("Осмотр"),
                eq(true)
        );
    }

    @Test
    void process_nullComplaintsAndNotes_returns204() throws Exception {
        mockMvc.perform(put("/api/appointments/5/process")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "status": "scheduled",
                                  "complaints": null,
                                  "notes": null,
                                  "treatmentDone": true
                                }
                                """))
                .andExpect(status().isNoContent());

        verify(hasuraClient).processAppointment(
                eq(5),
                eq("scheduled"),
                eq(null),
                eq(null),
                eq(true)
        );
    }

    @Test
    void process_invalidTransition_returns400() throws Exception {
        doThrow(new IllegalArgumentException("Недопустимый переход статуса: completed → scheduled"))
                .when(hasuraClient)
                .processAppointment(anyInt(), anyString(), any(), any(), anyBoolean());

        mockMvc.perform(put("/api/appointments/5/process")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "status": "scheduled",
                                  "complaints": null,
                                  "notes": null,
                                  "treatmentDone": false
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void process_invalidStatus_returns400() throws Exception {
        mockMvc.perform(put("/api/appointments/5/process")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "status": "invalid",
                                  "complaints": null,
                                  "notes": null,
                                  "treatmentDone": false
                                }
                                """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void cancel_returns204() throws Exception {
        mockMvc.perform(post("/api/appointments/5/cancel"))
                .andExpect(status().isNoContent());

        verify(hasuraClient).cancelAppointment(5);
    }

    @Test
    void process_notFound_returns404() throws Exception {
        doThrow(new IllegalArgumentException("Приём не найден: 99"))
                .when(hasuraClient)
                .processAppointment(anyInt(), anyString(), any(), any(), anyBoolean());

        mockMvc.perform(put("/api/appointments/99/process")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "status": "arrived",
                                  "complaints": null,
                                  "notes": null,
                                  "treatmentDone": false
                                }
                                """))
                .andExpect(status().isNotFound());
    }
}
