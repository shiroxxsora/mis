package com.mis.servicelogic.controller;

import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.config.RecognitionExceptionHandler;
import com.mis.servicelogic.service.MinioStorageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = PatientImageController.class)
@AutoConfigureMockMvc(addFilters = false)
@Import(RecognitionExceptionHandler.class)
class PatientImageControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private HasuraClient hasuraClient;

    @MockBean
    private MinioStorageService storageService;

    @Test
    void upload_savesToMinioAndHasura() throws Exception {
        when(storageService.buildObjectKey(1001, "tooth.png")).thenReturn("patients/1001/uuid-tooth.png");
        when(storageService.publicUri("patients/1001/uuid-tooth.png")).thenReturn("http://minio:9000/mis-patient-images/patients/1001/uuid-tooth.png");
        when(hasuraClient.insertPatientImage(eq(1001), eq("opg"), eq("patients/1001/uuid-tooth.png"), any(), any(), any()))
                .thenReturn(55);

        MockMultipartFile file = new MockMultipartFile(
                "file", "tooth.png", "image/png", new byte[] {1, 2, 3});

        mockMvc.perform(multipart("/api/patients/1001/images")
                        .file(file)
                        .param("type", "opg")
                        .param("toothNumber", "2.6"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(55))
                .andExpect(jsonPath("$.filePath").value("patients/1001/uuid-tooth.png"))
                .andExpect(jsonPath("$.downloadUrl").value("/api/patients/images/55/file"));

        verify(storageService).upload(eq("patients/1001/uuid-tooth.png"), any(), eq(3L), eq("image/png"));
    }

    @Test
    void upload_emptyFile_returns400() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "empty.png", "image/png", new byte[0]);

        mockMvc.perform(multipart("/api/patients/1001/images")
                        .file(file)
                        .param("type", "opg"))
                .andExpect(status().isBadRequest());
    }
}
