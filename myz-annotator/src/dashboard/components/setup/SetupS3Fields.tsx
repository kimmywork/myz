import { defineComponent } from "vue";
import type { PropType } from "vue";

/** Editable S3 form value used across the wizard steps. */
export interface S3FormValue {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  prefix: string;
}

export const EMPTY_S3_FORM: S3FormValue = {
  endpoint: "",
  region: "",
  bucket: "",
  accessKeyId: "",
  secretAccessKey: "",
  sessionToken: "",
  prefix: "",
};

export const setupInputClass =
  "w-full rounded-control border border-line bg-surface px-3 py-2 text-compact text-text placeholder:text-muted transition focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/20 disabled:opacity-60 dark:border-line dark:bg-surface-2 dark:text-text dark:placeholder:text-muted";

export function toS3Form(value: Partial<S3FormValue> | undefined): S3FormValue {
  return {
    endpoint: value?.endpoint || "",
    region: value?.region || "",
    bucket: value?.bucket || "",
    accessKeyId: value?.accessKeyId || "",
    secretAccessKey: value?.secretAccessKey || "",
    sessionToken: value?.sessionToken || "",
    prefix: value?.prefix || "",
  };
}

/** `https://` anywhere, or `http://` only for loopback hosts. */
export function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/** Required field + endpoint scheme validation; returns a message or null. */
export function validateS3Form(value: S3FormValue): string | null {
  if (!value.endpoint.trim()) return "请填写 Endpoint";
  if (!isAllowedEndpoint(value.endpoint.trim())) {
    return "Endpoint 必须是 https://（仅 localhost/127.0.0.1 可用 http）";
  }
  if (!value.bucket.trim()) return "请填写 Bucket";
  if (!value.accessKeyId.trim()) return "请填写 Access Key ID";
  if (!value.secretAccessKey.trim()) return "请填写 Secret Access Key";
  return null;
}

interface FieldSpec {
  key: keyof S3FormValue;
  label: string;
  placeholder?: string;
  hint?: string;
  type?: string;
  required?: boolean;
}

const FIELDS: FieldSpec[] = [
  {
    key: "endpoint",
    label: "Endpoint",
    placeholder: "https://s3.example.com",
    required: true,
  },
  { key: "region", label: "Region", placeholder: "us-east-1" },
  { key: "bucket", label: "Bucket", placeholder: "myz-sync", required: true },
  {
    key: "accessKeyId",
    label: "Access Key ID",
    placeholder: "AKIA…",
    required: true,
  },
  {
    key: "secretAccessKey",
    label: "Secret Key",
    type: "password",
    required: true,
  },
  {
    key: "sessionToken",
    label: "Session Token",
    hint: "可选：S3 临时凭证（STS）需要",
  },
  { key: "prefix", label: "Prefix", hint: "可选" },
];

/**
 * S3 configuration fields shared by the wizard branches. Purely presentational:
 * the parent owns the form value and updates it through `onUpdate`.
 */
export default defineComponent({
  name: "SetupS3Fields",
  props: {
    value: {
      type: Object as PropType<S3FormValue>,
      required: true,
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    onUpdate: {
      type: Function as PropType<
        (field: keyof S3FormValue, value: string) => void
      >,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <div class="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label
            key={field.key}
            class={[
              "flex flex-col gap-1.5",
              field.key === "endpoint" ? "sm:col-span-2" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span class="text-caption font-medium text-text">
              {field.label}
              {field.required ? <span class="text-error"> *</span> : null}
            </span>
            <input
              type={field.type || "text"}
              class={setupInputClass}
              aria-label={field.label}
              placeholder={field.placeholder}
              disabled={props.disabled}
              value={props.value[field.key]}
              onInput={(event: InputEvent) =>
                props.onUpdate(
                  field.key,
                  (event.target as HTMLInputElement).value,
                )
              }
            />
            {field.hint ? (
              <span class="text-caption text-muted">{field.hint}</span>
            ) : null}
          </label>
        ))}
      </div>
    );
  },
});
