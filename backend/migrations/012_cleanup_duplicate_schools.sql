-- 清理重复的学校数据，只保留每个学校名称的第一条记录
-- 使用 JOIN 方式删除重复数据（保留id最小的）
DELETE s1 FROM schools s1
INNER JOIN schools s2
WHERE s1.name = s2.name AND s1.id > s2.id;
