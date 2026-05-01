import { YouTubeClient } from "@domien-sev/ads-sdk";

const client = new YouTubeClient({
  serviceAccountKeyPath: "C:/Users/domie/Downloads/sev-ai-ops-f96b4c39c6fa.json",
  impersonateEmail: "domien@shoppingeventvip.be",
});

const uploads = [
  { path: "C:/Dev/sev-ai-collaborative-setup/.tmp/youtube-new-vids/jana2.mov",         title: "Le Salon VIP — Jana #Shorts" },
  { path: "C:/Dev/sev-ai-collaborative-setup/.tmp/youtube-new-vids/laure.mov",         title: "Le Salon VIP — Laure #Shorts" },
  { path: "C:/Dev/sev-ai-collaborative-setup/.tmp/youtube-new-vids/manon-trimmed.mov", title: "Le Salon VIP — Manon #Shorts" },
];

const results = [];
for (const u of uploads) {
  console.log(`Uploading ${u.title}...`);
  const r = await client.uploadVideo({
    filePath: u.path,
    title: u.title,
    description: "Le Salon VIP — hoge kortingen op topmerken. #Shorts",
    privacyStatus: "unlisted",
    tags: ["LeSalonVIP", "Shorts", "Outlet", "Fashion"],
  });
  console.log(`  → ${r.videoId} ${r.url}`);
  results.push({ title: u.title, ...r });
}
console.log("\nDONE");
console.log(JSON.stringify(results, null, 2));
