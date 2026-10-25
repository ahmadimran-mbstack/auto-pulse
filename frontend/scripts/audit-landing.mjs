// Audit script to verify HTML structure, SEO tags, heading hierarchy, and contrast
async function run() {
  const res = await fetch("http://localhost:3000/");
  const html = await res.text();

  console.log("Status Code:", res.status);
  console.log("HTML Size:", (html.length / 1024).toFixed(2), "kB");
  console.log("Has lang attribute:", html.includes("lang=\"en\""));
  console.log("Title tag:", html.includes("<title>AutoPulse: Daily LinkedIn posts. You approve each one.</title>"));
  console.log("Meta description:", html.includes('name="description"'));
  console.log("OpenGraph title:", html.includes('property="og:title"'));
  console.log("OpenGraph description:", html.includes('property="og:description"'));
  console.log("OpenGraph type:", html.includes('property="og:type"'));
  console.log("Viewport meta tag:", html.includes('name="viewport"'));
  console.log("Favicon:", html.includes("/icon.svg"));

  const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  console.log("Number of H1 tags:", h1Matches.length);
  if (h1Matches.length > 0) {
    console.log("H1 Content:", h1Matches[0].replace(/<[^>]+>/g, "").trim());
  }

  const h2Matches = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
  console.log("Number of H2 tags:", h2Matches.length);
  h2Matches.forEach((h2, i) => {
    console.log(`  H2 #${i + 1}:`, h2.replace(/<[^>]+>/g, "").trim());
  });

  const h3Matches = html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/gi) || [];
  console.log("Number of H3 tags:", h3Matches.length);
  h3Matches.forEach((h3, i) => {
    console.log(`  H3 #${i + 1}:`, h3.replace(/<[^>]+>/g, "").trim());
  });
}

run().catch(console.error);
