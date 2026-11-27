import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { zipSync, strToU8 } from "three/examples/jsm/libs/fflate.module.js";

const ROOT = process.cwd();
const ASSETS_SRC_DIR = path.join(ROOT, "assets-chapters");
const OUT_ZIPS_DIR = path.join(ROOT, "dist-levels");
const MANIFEST_PATHS = [
  path.join(ROOT, "manifest.json"),
  path.join(ROOT, "public", "manifest.json"),
];

const CHAPTER_METADATA = [
  { id: "fase_01", capitulo: 1, nome: "Cap. 1 · Ala Médica (Quarentena)", palette: "medical" },
  { id: "fase_02", capitulo: 2, nome: "Cap. 2 · Átrio Azul Frio", palette: "atrium" },
  { id: "fase_03", capitulo: 3, nome: "Cap. 3 · Alojamentos da Equipe", palette: "quarters" },
  { id: "fase_04", capitulo: 4, nome: "Cap. 4 · Bio-Tanques (Câmara 00)", palette: "biolab" },
  { id: "fase_05", capitulo: 5, nome: "Cap. 5 · Engenharia & Núcleo Azul", palette: "engineering" },
  { id: "fase_06", capitulo: 6, nome: "Cap. 6 · Bloco Ômega (Titânio Negro)", palette: "omega" },
  { id: "fase_07", capitulo: 7, nome: "Cap. 7 · Hangar de Carga & Exterior", palette: "hangar" },
];

const VERSION = process.env.LEVEL_PACK_VERSION || "1.0.0";
const REPO = "Dracko8891/Protocolo-Newborn";
const RELEASE_TAG = `levels-v${VERSION}`;

fs.mkdirSync(OUT_ZIPS_DIR, { recursive: true });

function collectFilesRecursive(dirPath, prefix = "") {
  const result = {};
  if (!fs.existsSync(dirPath)) return result;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(result, collectFilesRecursive(full, rel));
    } else if (entry.isFile()) {
      result[rel] = new Uint8Array(fs.readFileSync(full));
    }
  }
  return result;
}

const niveis = [];

const SHARED_ASSETS_DIR = path.join(ASSETS_SRC_DIR, "shared");
const sharedFilesMap = collectFilesRecursive(SHARED_ASSETS_DIR);

for (const ch of CHAPTER_METADATA) {
  const chFolder = path.join(ASSETS_SRC_DIR, ch.id);
  const filesMap = {
    ...sharedFilesMap,
    ...collectFilesRecursive(chFolder),
  };

  filesMap["level_meta.json"] = strToU8(
    JSON.stringify(
      {
        id: ch.id,
        capitulo: ch.capitulo,
        nome: ch.nome,
        palette: ch.palette,
        versao: VERSION,
        draco: true,
        ktx2: true,
        narrationPtBr: true,
      },
      null,
      2
    )
  );

  const zipped = zipSync(filesMap, { level: 9 });
  const zipFilePath = path.join(OUT_ZIPS_DIR, `${ch.id}.zip`);
  fs.writeFileSync(zipFilePath, zipped);

  const sha256 = createHash("sha256").update(zipped).digest("hex");
  const sizeMb = Number(Math.max(0.01, zipped.byteLength / (1024 * 1024)).toFixed(2));

  niveis.push({
    id: ch.id,
    capitulo: ch.capitulo,
    nome: ch.nome,
    "versão": VERSION,
    tamanho_mb: sizeMb,
    url_download: `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${ch.id}.zip`,
    sha256_hash: sha256,
  });

  console.log(`[OK] ${ch.id}.zip -> ${sizeMb} MB (sha256: ${sha256.slice(0, 12)}...)`);
}

const manifest = {
  jogo: "Protocolo Newborn",
  repositorio: REPO,
  versao_manifesto: VERSION,
  atualizado_em: new Date().toISOString(),
  niveis,
};

for (const target of MANIFEST_PATHS) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`[Manifesto atualizado] ${path.relative(ROOT, target)}`);
}
