// ============ CONFIG ============
// Paste your deployed Apps Script Web App URL below (ends in /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbzxzNvxxEmtZo8mPjn2gbTKZ_ob9t-niUW4CVaMasEC5GYcoXS1yXtUckS-7AekaRx3mA/exec';



const STATUS_META = {
  P:     { label: 'Present',   color: '#3DD68C' },
  A:     { label: 'Absent',    color: '#F2495C' },
  HD:    { label: 'Half Day',  color: '#F5A623' },
  WFH:   { label: 'Work From Home', color: '#4EA1FF' },
  Leave: { label: 'Leave',     color: '#B084F0' },
  WO:    { label: 'Week Off',  color: '#8A93A6' }
};

const STATUS_LIST = ['P', 'A', 'HD', 'Leave', 'WO'];
