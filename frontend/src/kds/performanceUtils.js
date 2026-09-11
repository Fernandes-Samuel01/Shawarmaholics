export function kitchenStatus(metrics){
  const completed=Number(metrics?.completed_orders)||0;
  const delayed=Number(metrics?.delayed_orders)||0;
  const onTime=Number(metrics?.on_time_percentage)||0;
  if(!completed)return {key:'empty',label:'NO COMPLETED ORDERS',icon:'○',message:'Performance metrics will appear once orders are completed today.'};
  if(onTime>=95&&delayed<=2)return {key:'excellent',label:'EXCELLENT',icon:'✓',message:`${onTime}% of completed orders were prepared within the target preparation time.`};
  if(onTime<75||delayed>=Math.max(5,Math.ceil(completed*.2)))return {key:'critical',label:'KITCHEN DELAY',icon:'⚠',message:'Several orders significantly exceeded the target preparation time.'};
  if(onTime<90||delayed>2)return {key:'attention',label:'NEEDS ATTENTION',icon:'⚠',message:'Several orders exceeded the target preparation time today.'};
  return {key:'good',label:'GOOD',icon:'✓',message:`${onTime}% of completed orders were prepared within the target preparation time.`};
}

export function formatMetric(value,fallback='—'){
  return value===null||value===undefined||Number.isNaN(Number(value))?fallback:String(value);
}
