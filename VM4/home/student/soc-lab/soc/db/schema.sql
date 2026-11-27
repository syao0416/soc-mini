
USE socdb;

CREATE TABLE IF NOT EXISTS events (

    -- 이벤트 식별 정보
    event_id CHAR(36) NOT NULL,
    schema_version VARCHAR(20) NOT NULL,

    -- 시간 정보 (UTC 기준)
    event_time DATETIME(6) NULL,
    event_time_source VARCHAR(100) NULL,
    log_recorded_at DATETIME(6) NULL,
    forward_event_time DATETIME(6) NULL,
    normalized_at DATETIME(6) NOT NULL,

    -- 로그 수집 정보
    source_vm VARCHAR(20) NOT NULL,
    source_tag VARCHAR(100) NULL,
    log_type VARCHAR(30) NOT NULL,

    -- 이벤트 분류 정보
    event_category VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,

    -- 심각도 정보
    severity VARCHAR(20) NOT NULL,
    severity_level TINYINT UNSIGNED NOT NULL,
    severity_reason TEXT NULL,
    severity_policy VARCHAR(50) NULL,

    -- 네트워크 정보
    src_ip VARCHAR(45) NULL,
    src_port SMALLINT UNSIGNED NULL,
    dst_ip VARCHAR(45) NULL,
    dst_port SMALLINT UNSIGNED NULL,
    dst_info_source VARCHAR(100) NULL,
    protocol VARCHAR(30) NULL,

    -- 로그 내용
    message TEXT NULL,
    details JSON NOT NULL,
    raw_log LONGTEXT NOT NULL,

    -- DB 적재 시간
    inserted_at TIMESTAMP(6) NOT NULL
        DEFAULT CURRENT_TIMESTAMP(6),

    -- 기본키
    PRIMARY KEY (event_id),

    -- 심각도 범위 제한
    CONSTRAINT chk_severity_level
        CHECK (severity_level BETWEEN 0 AND 4),

    -- 검색용 인덱스
    INDEX idx_event_time (event_time),
    INDEX idx_log_type_time (log_type, event_time),
    INDEX idx_severity_time (severity_level, event_time),
    INDEX idx_source_vm (source_vm),
    INDEX idx_src_ip (src_ip),
    INDEX idx_dst_ip (dst_ip)

) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
