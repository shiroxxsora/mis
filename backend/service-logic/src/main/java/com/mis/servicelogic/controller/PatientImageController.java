package com.mis.servicelogic.controller;

import com.mis.servicelogic.client.HasuraClient;
import com.mis.servicelogic.dto.PatientImageResponse;
import com.mis.servicelogic.service.MinioStorageService;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.model.S3Exception;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@RestController
@RequestMapping("/api/patients")
public class PatientImageController {

    private final HasuraClient hasuraClient;
    private final MinioStorageService storageService;

    public PatientImageController(HasuraClient hasuraClient, MinioStorageService storageService) {
        this.hasuraClient = hasuraClient;
        this.storageService = storageService;
    }

    @PostMapping(value = "/{patientId}/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<PatientImageResponse> upload(
            @PathVariable int patientId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("type") String type,
            @RequestParam(value = "takenAt", required = false) String takenAt,
            @RequestParam(value = "toothNumber", required = false) String toothNumber,
            @RequestParam(value = "notes", required = false) String notes) throws IOException {
        if (file.isEmpty()) {
            throw new ResponseStatusException(BAD_REQUEST, "Файл не может быть пустым");
        }
        if (type == null || type.isBlank()) {
            throw new ResponseStatusException(BAD_REQUEST, "Укажите type снимка");
        }
        try {
            hasuraClient.requirePatientExists(patientId);
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(NOT_FOUND, ex.getMessage(), ex);
        }
        validateTakenAt(takenAt);

        String objectKey = storageService.buildObjectKey(patientId, file.getOriginalFilename());
        try {
            storageService.upload(objectKey, file.getInputStream(), file.getSize(), file.getContentType());
        } catch (S3Exception ex) {
            throw new IllegalStateException("Не удалось сохранить файл в MinIO: " + ex.getMessage(), ex);
        }

        int imageId = hasuraClient.insertPatientImage(
                patientId,
                type.trim(),
                objectKey,
                takenAt,
                blankToNull(toothNumber),
                blankToNull(notes));

        return ResponseEntity.ok(new PatientImageResponse(
                imageId,
                patientId,
                type.trim(),
                objectKey,
                storageService.publicUri(objectKey),
                "/api/patients/images/" + imageId + "/file"));
    }

    @GetMapping("/images/{imageId}/file")
    public ResponseEntity<InputStreamResource> download(@PathVariable int imageId) {
        HasuraClient.PatientImageRecord image = hasuraClient.findPatientImage(imageId);
        if (image == null) {
            throw new ResponseStatusException(NOT_FOUND, "Снимок не найден");
        }

        try {
            MinioStorageService.StoredObject stored = storageService.download(image.filePath());
            MediaType mediaType = stored.contentType() != null
                    ? MediaType.parseMediaType(stored.contentType())
                    : MediaType.APPLICATION_OCTET_STREAM;

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + stored.filename() + "\"")
                    .contentType(mediaType)
                    .body(new InputStreamResource(stored.stream()));
        } catch (S3Exception ex) {
            throw new ResponseStatusException(NOT_FOUND, "Файл не найден в хранилище");
        }
    }

    private static void validateTakenAt(String takenAt) {
        if (takenAt == null || takenAt.isBlank()) {
            return;
        }
        try {
            OffsetDateTime.parse(takenAt);
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(BAD_REQUEST, "takenAt должен быть в формате ISO-8601");
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
