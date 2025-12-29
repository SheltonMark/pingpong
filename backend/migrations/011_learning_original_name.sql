-- 为学习资料表添加原始文件名字段
ALTER TABLE learning_materials ADD COLUMN original_name VARCHAR(255) DEFAULT NULL AFTER url;
