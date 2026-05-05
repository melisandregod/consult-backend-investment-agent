import YahooFinance from 'yahoo-finance2';

export const yahooFinance = new YahooFinance({
    suppressNotices: ["ripHistorical", "yahooSurvey"],
    validation: {
        logErrors: false,
    },
});
