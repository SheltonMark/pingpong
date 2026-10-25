const UNASSIGNED_CAMPUS = '__unassigned__';

function getCampusOptions(points = []) {
  const campuses = [...new Set(points.map(point => (point.campus || '').trim()).filter(Boolean))].sort();
  const options = [{ value: '', label: '全部校区' }, ...campuses.map(value => ({ value, label: value }))];
  if (points.some(point => !(point.campus || '').trim())) {
    options.push({ value: UNASSIGNED_CAMPUS, label: '未设置校区' });
  }
  return options;
}

function filterPointsByCampus(points = [], campus = '') {
  if (!campus) return points;
  return points.filter(point => campus === UNASSIGNED_CAMPUS
    ? !(point.campus || '').trim() : (point.campus || '').trim() === campus);
}

module.exports = { UNASSIGNED_CAMPUS, getCampusOptions, filterPointsByCampus };
