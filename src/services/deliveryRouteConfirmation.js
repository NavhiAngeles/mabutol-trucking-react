export function initialRouteProfile(context) {
  const saved = context?.plan?.profile;
  if (saved) {
    return {
      height: saved.height ?? '',
      width: saved.width ?? '',
      length: saved.length ?? '',
      weight: saved.weight ?? '',
      axleload: saved.axleload ?? '',
      prefilledFromTruck: false,
    };
  }

  const truck = context?.truck;
  if (!truck) {
    return {
      height: '',
      width: '',
      length: '',
      weight: '',
      axleload: '',
      prefilledFromTruck: false,
    };
  }

  const cargoKg = Number(context?.shipment?.weight_kg) || 0;
  const tareKg = Number(truck.tare_weight_kg);
  const grossKg = Number(truck.gross_weight_kg);
  let loadedTonnes = '';
  if (Number.isFinite(tareKg) && tareKg > 0) {
    const candidate = Number(((tareKg + cargoKg) / 1000).toFixed(2));
    if (candidate * 1000 > cargoKg && candidate <= 200) {
      loadedTonnes = candidate;
    }
  } else if (Number.isFinite(grossKg) && grossKg > cargoKg) {
    const candidate = Number((grossKg / 1000).toFixed(2));
    if (candidate <= 200) {
      loadedTonnes = candidate;
    }
  }

  const axles = Number(truck.axle_count);
  let axleload = '';
  if (loadedTonnes !== '' && Number.isFinite(axles) && axles >= 2) {
    const candidate = Number((loadedTonnes / axles).toFixed(2));
    if (candidate > 0 && candidate <= 100 && candidate <= loadedTonnes) {
      axleload = candidate;
    }
  }

  const height = truck.height_m ?? '';
  const width = truck.width_m ?? '';
  const length = truck.length_m ?? '';
  const prefilledFromTruck = [height, width, length, loadedTonnes, axleload].some(v => v !== '' && v != null);

  return {
    height,
    width,
    length,
    weight: loadedTonnes,
    axleload,
    prefilledFromTruck,
  };
}

export function routeConfirmation(context,form) {
  if(!context?.delivery?.id || !context.delivery.updated_at || !context.shipment?.updated_at || form.confirmed!==true || form.reason?.trim().length<5 || form.reason.trim().length>1000)throw Error('Reload the assignment and confirm its pins, truck measurements and verification reason.');
  const pins=Object.fromEntries(['pickup_lat','pickup_lng','dropoff_lat','dropoff_lng'].map(key=>[key,form[key]==='' || form[key]==null?NaN:Number(form[key])]));
  const limits={height:10,width:10,length:50,weight:200,axleload:100};
  const profile={...Object.fromEntries(Object.keys(limits).map(key=>[key,form[key]==='' || form[key]==null?NaN:Number(form[key])])),hazmat:form.hazmat};
  if(Object.values(pins).some(value=>!Number.isFinite(value)) || Math.abs(pins.pickup_lat)>90 || Math.abs(pins.dropoff_lat)>90 || Math.abs(pins.pickup_lng)>180 || Math.abs(pins.dropoff_lng)>180 || (pins.pickup_lat===pins.dropoff_lat && pins.pickup_lng===pins.dropoff_lng) || Object.entries(limits).some(([key,max])=>!Number.isFinite(profile[key]) || profile[key]<=0 || profile[key]>max) || typeof profile.hazmat!=='boolean' || profile.axleload>profile.weight || profile.weight*1000<=Number(context.shipment.weight_kg))throw Error('Enter valid pins, all loaded truck measurements, and an explicit hazardous-goods declaration. Gross weight must include the truck and cargo.');
  return {mode:'confirm',delivery_id:context.delivery.id,expected:context.delivery.updated_at,shipment_expected:context.shipment.updated_at,...pins,profile,confirmed:true,reason:form.reason.trim()};
}
