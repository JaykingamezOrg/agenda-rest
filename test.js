import { promisify } from "util";
import request from "supertest";
import {
    bootstrapKoaApp,
    oncePerKey,
    AsyncCounter,
    buildUrlWithParams,
    buildUrlWithQuery,
} from "./src/util.js";
import assert, { doesNotMatch } from "assert";

const agendaAppUrl = "http://localhost:4041";
const testAppUrl = "http://localhost:4042";
const { app: testApp, router: testAppRouter } = bootstrapKoaApp();
const getTestAppUrl = (path) => (path ? `${testAppUrl}${path}` : testAppUrl);

const agendaAppRequest = request(agendaAppUrl);

const bootstrapApp = async () => {
    const { app, jobsReady } = require("./src");
    await promisify(app.listen)
        .bind(app)(4041)
        .then(() => console.log("agenda-rest app running"));

    await promisify(testApp.listen)
        .bind(testApp)(4042)
        .then(() => console.log("test app running"));
    await jobsReady;
};

describe('Test Job Requests', () => {
    var defineFooEndpoint;

    before(() => {
        bootstrapApp();

        const fooProps = {};

        defineFooEndpoint = (
            route,
            message,
            countTimes = 1,
            statusCode = 200
        ) => {
            const counter = new AsyncCounter(countTimes);
            fooProps.counter = counter;
            fooProps.message = message;
            fooProps.statusCode = statusCode;

            const define = oncePerKey(route, () =>
                testAppRouter.post(route, async (ctx, next) => {
                    ctx.body = fooProps.message;
                    ctx.status = fooProps.statusCode;
                    console.log(
                        `${fooProps.message}! ${await fooProps.counter.count()} of ${fooProps.counter.countTimes
                        }`
                    );
                    await next();
                })
            );
            define();
            return counter;
        };
    });

    it("POST /api/job fails without content", async () => {
        const res = await agendaAppRequest.post("/api/job").send();
        assert.equal(res.status, 400);
    });

    it("POST /api/job succeeds when a job is specified", async () => {
        const res = await agendaAppRequest
            .post("/api/job")
            .send({ name: "foo", url: getTestAppUrl("/fooWrong") });

        assert.equal(res.status, 200);
    });

    it("PUT /api/job fails when the job does not exists", async () => {
        const res = await agendaAppRequest
            .put("/api/job/fooWrong")
            .send({ url: getTestAppUrl("/foo") });

        assert.equal(res.status, 400);
    });

    it("PUT /api/job succeeds when the job exists", async () => {
        const res = await agendaAppRequest
            .put("/api/job/foo")
            .send({ url: getTestAppUrl("/foo") });

        assert.equals(res.status, 200);
    });

    it("POST /api/job/now with existing foo definition invokes the foo endpoint", async () => {
        const counter = defineFooEndpoint("/foo", "foo now invoked");
        const res = await agendaAppRequest
            .post("/api/job/now")
            .send({ name: "foo" });

        assert.equal(res.text, "job scheduled for now");

        await counter.finished;
    });

    it("POST /api/job/every with existing foo definition invokes the foo endpoint", async () => {
        const counter = defineFooEndpoint("/foo", "foo every invoked", 3);
        const res = await agendaAppRequest
            .post("/api/job/every")
            .send({ name: "foo", interval: "2 seconds" });

        assert.equal(res.text, "job scheduled for repetition");
        await counter.finished;
    });

    it("POST /api/job/once with existing foo definition invokes the foo endpoint", async () => {
        const counter = defineFooEndpoint("/foo", "foo once invoked");
        const res = await agendaAppRequest
            .post("/api/job/once")
            .send({ name: "foo", interval: new Date().getTime() + 10000 });
        // .send({name: 'foo', interval: 'in 10 seconds'});

        assert.equal(res.text, "job scheduled for once");
        await counter.finished;
    });

    it("DELETE /api/job succeeds when a job is defined", async () => {
        const res = await agendaAppRequest.delete("/api/job/foo");

        assert.equal(res.status, 200);
    });

    it("Build URL with parameters.", () => {
        assert.equal(
            buildUrlWithParams({
                url: "http://example.com:8888/foo/:param1/:param2",
                params: { param1: "value1", param2: "value2" },
            }),
            "http://example.com:8888/foo/value1/value2"
        );
    });

    it("Build URL with query.", () => {
        assert.equal(
            buildUrlWithQuery({
                url: "http://example.com/foo",
                query: { query1: "value1", query2: "value2" },
            }),
            "http://example.com/foo?query1=value1&query2=value2"
        );
    });
});



/* TODO
testAppRouter.post('/foo/:fooParam', async (ctx, next) => {
  console.log('foo with params invoked!');
  console.log(ctx.params);
  console.log(ctx.request.body);
  ctx.body = 'foo with params success';
  ctx.status = 200;
  await next();
});

testAppRouter.post('/foo/cb', async (ctx, next) => {
  console.log('foo callback invoked!');
  ctx.body = 'foo callback success';
  ctx.status = 200;
  await next();
});
*/