import Redis from "ioredis";

const createServerRedis = () => {
  return new Redis({
    host: "localhost",
    port: 6379,
  });
};

export const redis = createServerRedis();

export const publisher = createServerRedis();

export const subscriber = createServerRedis();
