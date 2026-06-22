import type { StoragePlatform } from "./storage";

export const getItem: StoragePlatform["getItem"] = async (key) =>
  Promise.resolve(localStorage.getItem(key));

export const setItem: StoragePlatform["setItem"] = async (key, value) => {
  localStorage.setItem(key, value);
};

export const removeItem: StoragePlatform["removeItem"] = async (key) => {
  localStorage.removeItem(key);
};
