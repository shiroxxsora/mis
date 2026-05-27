package com.mis.servicelogic.service;

import com.mis.servicelogic.config.MinioProperties;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.CreateBucketRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.InputStream;
import java.util.UUID;

@Service
public class MinioStorageService {

    private final S3Client s3Client;
    private final MinioProperties properties;

    public MinioStorageService(S3Client s3Client, MinioProperties properties) {
        this.s3Client = s3Client;
        this.properties = properties;
    }

    public void ensureBucketExists() {
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(properties.bucket()).build());
        } catch (NoSuchBucketException ex) {
            s3Client.createBucket(CreateBucketRequest.builder().bucket(properties.bucket()).build());
        }
    }

    public String buildObjectKey(int patientId, String originalFilename) {
        String safeName = sanitizeFilename(originalFilename);
        return "patients/" + patientId + "/" + UUID.randomUUID() + "-" + safeName;
    }

    public void upload(String objectKey, InputStream content, long size, String contentType) {
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(properties.bucket())
                .key(objectKey)
                .contentType(contentType != null && !contentType.isBlank() ? contentType : "application/octet-stream")
                .build();
        s3Client.putObject(request, RequestBody.fromInputStream(content, size));
    }

    public StoredObject download(String objectKey) {
        var response = s3Client.getObject(GetObjectRequest.builder()
                .bucket(properties.bucket())
                .key(objectKey)
                .build());
        return new StoredObject(
                response,
                response.response().contentType(),
                filenameFromKey(objectKey));
    }

    public String publicUri(String objectKey) {
        String endpoint = properties.endpoint().replaceAll("/+$", "");
        return endpoint + "/" + properties.bucket() + "/" + objectKey;
    }

    private static String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "file.bin";
        }
        String normalized = filename.replace("\\", "/");
        int slash = normalized.lastIndexOf('/');
        if (slash >= 0) {
            normalized = normalized.substring(slash + 1);
        }
        normalized = normalized.replaceAll("[^a-zA-Z0-9._-]", "_");
        return normalized.isBlank() ? "file.bin" : normalized;
    }

    private static String filenameFromKey(String objectKey) {
        int dash = objectKey.lastIndexOf('-');
        if (dash >= 0 && dash + 1 < objectKey.length()) {
            return objectKey.substring(dash + 1);
        }
        int slash = objectKey.lastIndexOf('/');
        return slash >= 0 ? objectKey.substring(slash + 1) : objectKey;
    }

    public record StoredObject(
            software.amazon.awssdk.core.ResponseInputStream<software.amazon.awssdk.services.s3.model.GetObjectResponse> stream,
            String contentType,
            String filename
    ) {
    }
}
