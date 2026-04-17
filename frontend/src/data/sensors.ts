export interface Sensor {
  id: string;
  name: string;
  cropFactor: number;
  cocMm: number; // circle of confusion threshold (mm)
  sensorWMm: number; // physical width (mm)
  sensorHMm: number; // physical height (mm)
  isoBaseNoise: number; // noise sigma at ISO 100 (linear)
}

export const SENSORS: Sensor[] = [
  {
    id: "full-frame",
    name: "Full Frame (36×24mm)",
    cropFactor: 1.0,
    cocMm: 0.03,
    sensorWMm: 36,
    sensorHMm: 24,
    isoBaseNoise: 0.004,
  },
  {
    id: "apsc-sony",
    name: "APS-C Sony/Nikon (23.5×15.6mm)",
    cropFactor: 1.5,
    cocMm: 0.02,
    sensorWMm: 23.5,
    sensorHMm: 15.6,
    isoBaseNoise: 0.007,
  },
  {
    id: "apsc-canon",
    name: "APS-C Canon (22.3×14.9mm)",
    cropFactor: 1.6,
    cocMm: 0.019,
    sensorWMm: 22.3,
    sensorHMm: 14.9,
    isoBaseNoise: 0.008,
  },
  {
    id: "m43",
    name: "Micro Four Thirds (17.3×13mm)",
    cropFactor: 2.0,
    cocMm: 0.015,
    sensorWMm: 17.3,
    sensorHMm: 13,
    isoBaseNoise: 0.012,
  },
  {
    id: "one-inch",
    name: "1-inch (13.2×8.8mm)",
    cropFactor: 2.7,
    cocMm: 0.011,
    sensorWMm: 13.2,
    sensorHMm: 8.8,
    isoBaseNoise: 0.018,
  },
  {
    id: "phone",
    name: 'Phone (1/1.3" equiv.)',
    cropFactor: 7.21,
    cocMm: 0.004,
    sensorWMm: 5.6,
    sensorHMm: 4.2,
    isoBaseNoise: 0.035,
  },
];

export const DEFAULT_SENSOR_ID = "apsc-sony";
export const PHONE_SENSOR_ID = "phone";
