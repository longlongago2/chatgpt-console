import axios from 'axios';
import { get_current_weather } from './definition.js';

const amapKey = process.env.AMAP_KEY;

export default {
  /**
   * @description 获取高德地图天气 https://lbs.amap.com/api/webservice/guide/api/weatherinfo
   * @param {object} params
   * @param {string} params.location
   * @param {'base'|'all'} params.extensions
   */
  async [get_current_weather.name]({ location, extensions }) {
    if (!location) {
      throw new Error('Location not provided');
    }
    if (!amapKey) {
      throw new Error('AMap key not provided');
    }
    const params = new URLSearchParams({
      key: amapKey,
      address: location,
    });
    const { data } = await axios.get(`https://restapi.amap.com/v3/geocode/geo?${params.toString()}`);
    if (data.status === '0') {
      throw new Error(data.info);
    }
    const { adcode } = data.geocodes[0];
    if (!adcode) {
      throw new Error('Location adcode not found');
    }
    const params2 = new URLSearchParams({
      key: amapKey,
      city: adcode,
      extensions: extensions || 'base',
    });
    const { data: data2 } = await axios.get(
      `https://restapi.amap.com/v3/weather/weatherInfo?${params2.toString()}`,
    );
    if (data2.status === '0') {
      throw new Error(data2.info);
    }
    if (extensions === 'all') {
      return data2.forecasts;
    }
    return data2.lives;
  },
};
