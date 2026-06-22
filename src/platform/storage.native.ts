import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StoragePlatform } from "./storage";

export const getItem: StoragePlatform["getItem"] = (key) => AsyncStorage.getItem(key);
export const setItem: StoragePlatform["setItem"] = (key, value) => AsyncStorage.setItem(key, value);
export const removeItem: StoragePlatform["removeItem"] = (key) => AsyncStorage.removeItem(key);
