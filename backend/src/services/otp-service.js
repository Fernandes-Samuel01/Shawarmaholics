const crypto=require('crypto');

const OTP_TTL_SECONDS=300;
const OTP_COOLDOWN_SECONDS=30;
const OTP_PURPOSE='staff_attendance';
const hashSecret=()=>process.env.OTP_HASH_SECRET||process.env.JWT_SECRET||'development-otp-secret';

function normalizePhone(phone){
  const digits=String(phone||'').replace(/\D/g,'');
  return digits.length===12&&digits.startsWith('91')?digits.slice(2):digits;
}
function validPhone(phone){return /^\d{10}$/.test(normalizePhone(phone));}
function hashOtp(otp){return crypto.createHash('sha256').update(`${otp}:${hashSecret()}`).digest('hex');}
function generateOtp(){return crypto.randomInt(0,1000000).toString().padStart(6,'0');}
function safeEqualHash(left,right){const a=Buffer.from(left||'','hex');const b=Buffer.from(right||'','hex');return a.length===b.length&&a.length>0&&crypto.timingSafeEqual(a,b);}

async function issueOtp({query,phone,purpose=OTP_PURPOSE}){
  const normalized=normalizePhone(phone);
  const {rows:recent}=await query("SELECT id FROM otp_verifications WHERE phone=$1 AND purpose=$2 AND created_at>NOW()-INTERVAL '30 seconds' ORDER BY created_at DESC LIMIT 1",[normalized,purpose]);
  if(recent[0]){const error=new Error('Please wait before requesting another OTP');error.status=429;throw error;}
  const otp=generateOtp();
  await query('UPDATE otp_verifications SET used_at=COALESCE(used_at,NOW()) WHERE phone=$1 AND purpose=$2 AND used_at IS NULL',[normalized,purpose]);
  await query("INSERT INTO otp_verifications(phone,otp_hash,purpose,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '5 minutes')",[normalized,hashOtp(otp),purpose]);
  if((process.env.OTP_PROVIDER||'development').toLowerCase()==='development'){
    console.log('================================');
    console.log('DEVELOPMENT OTP');
    console.log(`Phone: ${normalized}`);
    console.log(`OTP: ${otp}`);
    console.log(`Purpose: ${purpose}`);
    console.log('Expires: 5 minutes');
    console.log('================================');
  }
  return {expiresInSeconds:OTP_TTL_SECONDS};
}

module.exports={OTP_PURPOSE,OTP_TTL_SECONDS,normalizePhone,validPhone,hashOtp,safeEqualHash,issueOtp};
