// ============ API WRAPPER ============
const API = {
  async _post(action, payload) {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, payload: payload || {} })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  login: (username, password) => API._post('login', { username, password }),
  getEmpMaster: () => API._post('getEmpMaster'),
  addEmployee: (emp) => API._post('addEmployee', emp),
  updateEmployee: (emp) => API._post('updateEmployee', emp),
  uploadLoginReport: (date, rows, updatedBy) => API._post('uploadLoginReport', { date, rows, updatedBy }),
  getDashboard: (date) => API._post('getDashboard', { date }),
  updateComplianceStatus: (date, empId, status, remark, updatedBy) =>
    API._post('updateComplianceStatus', { date, empId, status, remark, updatedBy }),
  bulkUpdateStatus: (date, empIds, status, remark, updatedBy) =>
    API._post('bulkUpdateStatus', { date, empIds, status, remark, updatedBy }),
  scheduleLeave: (leave) => API._post('scheduleLeave', leave),
  getLeaves: (empId) => API._post('getLeaves', { empId }),
  cancelLeave: (leaveId) => API._post('cancelLeave', { leaveId }),
  getFilters: () => API._post('getFilters'),
  getTrends: (fromDate, toDate) => API._post('getTrends', { fromDate, toDate }),
  getChronicOffenders: (days, threshold) => API._post('getChronicOffenders', { days, threshold }),
  exportDay: (date) => API._post('exportDay', { date })
};
