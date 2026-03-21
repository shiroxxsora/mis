package com.mis.kernal.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.mis.kernal.entity.KernalEntity;

public interface KernalRepository extends JpaRepository<KernalEntity, Long> {

}
