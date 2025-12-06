async function removeBackground(imageBuffer) {
  const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

  const result = await replicate.run(
    "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
    {
      input: {
        image: base64Image,
      },
    }
  );

  let url;

  // Case 1: Replicate returns a plain string URL
  if (typeof result === "string") {
    url = result;
  }
  // Case 2: Replicate returns an array (first element is URL)
  else if (Array.isArray(result) && typeof result[0] === "string") {
    url = result[0];
  }
  // Case 3: Replicate returns an object with .url() method
  else if (result && typeof result.url === "function") {
    url = await result.url();
  }
  // Case 4: Replicate returns an object with .url string property
  else if (result && typeof result.url === "string") {
    url = result.url;
  } else {
    console.error("Unexpected Replicate output format:", result);
    throw new Error("Unexpected Replicate output format from Replicate");
  }

  return url; // ← VERY IMPORTANT
}
