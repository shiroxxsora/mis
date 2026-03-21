package com.mis.kernal.service;

import java.util.List;

import com.mis.kernal.entity.KernalEntity;

public interface KernalService {

	List<KernalEntity> findAll();

	KernalEntity create(String name);

}
