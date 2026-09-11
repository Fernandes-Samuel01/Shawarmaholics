const API=import.meta.env.VITE_API_URL||'http://localhost:4000/api';

async function request(path,body){
  let response;
  try{response=await fetch(`${API}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}catch{const error=new Error('Unable to connect to the attendance service');error.network=true;throw error}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.message||'Attendance request failed');error.status=response.status;error.data=data;throw error}
  return data;
}
export const requestOtp=phone=>request('/staff-attendance/request-otp',{phone});
export const verifyOtp=(phone,otp)=>request('/staff-attendance/verify-otp',{phone,otp});
