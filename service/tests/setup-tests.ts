import "@testing-library/jest-dom";

jest.setTimeout(10000);

Reflect.set(process.env, "NODE_ENV", process.env.NODE_ENV ?? "test");
Reflect.set(process.env, "CAPTCHA_MODE", process.env.CAPTCHA_MODE ?? "builtin");
