#!/usr/bin/env node
import { createHash, createPrivateKey, createPublicKey, constants, sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const SIGNATURE_PAYLOAD_SCHEMA = "agent-app-cloud-release-signature-payload/v2";
export const SIGNATURE_PROOF_SCHEMA = "agent-app-cloud-release-signature/v1";
export const DEFAULT_SIGNATURE_ALGORITHM = "RSASSA-PKCS1-v1_5-SHA256";

const supportedAlgorithms = new Set([
  "RSASSA-PKCS1-v1_5-SHA256",
  "RSA-PSS-SHA256",
  "ECDSA-P256-SHA256",
  "Ed25519"
]);

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      throw new Error(`unknown positional argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function required(value, name) {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new Error(`${name} is required`);
  }
  return text;
}

function normalizeHash(value, name) {
  const text = required(value, name).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
    throw new Error(`${name} must be a complete sha256:<64 hex> digest`);
  }
  return text;
}

async function readPackageDefaults(rootDir) {
  const packageJson = JSON.parse(
    await readFile(path.join(rootDir, "package.json"), "utf8")
  );
  const pluginJson = JSON.parse(
    await readFile(path.join(rootDir, "plugin.json"), "utf8")
  );
  return {
    appId: pluginJson.id ?? packageJson.name,
    version: pluginJson.version ?? packageJson.version
  };
}

export function buildReleaseSignaturePayload(release, proofDraft) {
  return JSON.stringify({
    schemaVersion: SIGNATURE_PAYLOAD_SCHEMA,
    appId: release.appId,
    version: release.version,
    releaseId: release.releaseId ?? null,
    tenantId: release.tenantId ?? null,
    tenantEnablementRef: release.tenantEnablementRef ?? null,
    channel: release.channel ?? null,
    packageUrl: release.packageUrl,
    packageHash: release.packageHash.toLowerCase(),
    manifestHash: release.manifestHash.toLowerCase(),
    signatureRef: release.signatureRef ?? null,
    signatureProof: proofDraft
      ? {
          schemaVersion: proofDraft.schemaVersion ?? null,
          publicKeyId: proofDraft.publicKeyId,
          algorithm: proofDraft.algorithm,
          signedAt: proofDraft.signedAt ?? null
        }
      : null
  });
}

export function sha256Digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function signPayload(payload, privateKeyPem, algorithm) {
  const key = createPrivateKey(privateKeyPem);
  if (algorithm === "RSASSA-PKCS1-v1_5-SHA256") {
    return sign("sha256", Buffer.from(payload), {
      key,
      padding: constants.RSA_PKCS1_PADDING
    }).toString("base64");
  }
  if (algorithm === "RSA-PSS-SHA256") {
    return sign("sha256", Buffer.from(payload), {
      key,
      padding: constants.RSA_PKCS1_PSS_PADDING,
      saltLength: 32
    }).toString("base64");
  }
  if (algorithm === "ECDSA-P256-SHA256") {
    return sign("sha256", Buffer.from(payload), key).toString("base64");
  }
  if (algorithm === "Ed25519") {
    return sign(null, Buffer.from(payload), key).toString("base64");
  }
  throw new Error(`unsupported signature algorithm: ${algorithm}`);
}

export function buildReleaseSignature({
  release,
  privateKeyPem,
  publicKeyId,
  algorithm = DEFAULT_SIGNATURE_ALGORITHM,
  signedAt = new Date().toISOString()
}) {
  if (!supportedAlgorithms.has(algorithm)) {
    throw new Error(`unsupported signature algorithm: ${algorithm}`);
  }
  const normalizedRelease = {
    ...release,
    appId: required(release.appId, "appId"),
    version: required(release.version, "version"),
    packageUrl: required(release.packageUrl, "packageUrl"),
    packageHash: normalizeHash(release.packageHash, "packageHash"),
    manifestHash: normalizeHash(release.manifestHash, "manifestHash"),
    signatureRef: required(release.signatureRef, "signatureRef")
  };
  const proofDraft = {
    schemaVersion: SIGNATURE_PROOF_SCHEMA,
    publicKeyId: required(publicKeyId, "publicKeyId"),
    algorithm,
    signature: "",
    signedAt: required(signedAt, "signedAt")
  };
  if (!Number.isFinite(Date.parse(proofDraft.signedAt))) {
    throw new Error("signedAt must be an ISO 8601 timestamp");
  }
  const payload = buildReleaseSignaturePayload(normalizedRelease, proofDraft);
  const proof = {
    ...proofDraft,
    payloadHash: sha256Digest(payload),
    signature: signPayload(payload, privateKeyPem, algorithm)
  };
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem)).export({
    type: "spki",
    format: "pem"
  });
  return {
    release: normalizedRelease,
    payload,
    proof,
    trustRoot: {
      publicKeyId: proof.publicKeyId,
      algorithm: proof.algorithm,
      publicKey,
      appIds: [normalizedRelease.appId]
    }
  };
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

export function buildAppSignatureYaml(signature) {
  const { release, proof } = signature;
  return [
    "signature:",
    "  package:",
    `    schemaVersion: ${yamlString(proof.schemaVersion)}`,
    `    signatureRef: ${yamlString(release.signatureRef)}`,
    `    publicKeyId: ${yamlString(proof.publicKeyId)}`,
    `    algorithm: ${yamlString(proof.algorithm)}`,
    `    signature: ${yamlString(proof.signature)}`,
    `    payloadHash: ${yamlString(proof.payloadHash)}`,
    `    signedAt: ${yamlString(proof.signedAt)}`,
    ""
  ].join("\n");
}

async function readPrivateKey(args) {
  if (args["private-key-file"]) {
    return readFile(path.resolve(args["private-key-file"]), "utf8");
  }
  const envName = args["private-key-env"] ?? "AGENT_APP_SIGNING_PRIVATE_KEY_PEM";
  const value = process.env[envName];
  if (!value) {
    throw new Error(`missing private key: set ${envName} or pass --private-key-file`);
  }
  return value.replace(/\\n/g, "\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(args.root ?? process.cwd());
  const defaults = await readPackageDefaults(rootDir);
  const release = {
    appId: args["app-id"] ?? defaults.appId,
    version: args.version ?? defaults.version,
    releaseId: args["release-id"] ?? null,
    tenantId: args["tenant-id"] ?? null,
    tenantEnablementRef: args["tenant-enablement-ref"] ?? null,
    channel: args.channel ?? "stable",
    packageUrl: args["package-url"],
    packageHash: args["package-hash"],
    manifestHash: args["manifest-hash"],
    signatureRef: args["signature-ref"]
  };
  const signature = buildReleaseSignature({
    release,
    privateKeyPem: await readPrivateKey(args),
    publicKeyId: args["public-key-id"],
    algorithm: args.algorithm ?? DEFAULT_SIGNATURE_ALGORITHM,
    signedAt: args["signed-at"] ?? new Date().toISOString()
  });
  const appSignatureYaml = buildAppSignatureYaml(signature);
  if (args.out) {
    await writeFile(path.resolve(args.out), appSignatureYaml);
  } else {
    process.stdout.write(appSignatureYaml);
  }
  if (args["trust-root-out"]) {
    await writeFile(
      path.resolve(args["trust-root-out"]),
      `${JSON.stringify(signature.trustRoot, null, 2)}\n`
    );
  }
  if (args["payload-out"]) {
    await writeFile(path.resolve(args["payload-out"]), `${signature.payload}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
