import * as ImagePicker from "expo-image-picker";
import type { ImagePickerPlatform } from "./image-picker";

// Nativo: expo-image-picker. Sem expo-file-system — o blob vem de fetch(uri).
export const pickImage: ImagePickerPlatform["pickImage"] = async () => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });

  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;

  const resp = await fetch(asset.uri);
  const blob = await resp.blob();
  return { uri: asset.uri, blob, mimeType: asset.mimeType ?? "image/jpeg" };
};
