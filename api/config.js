import {
    USD_TO_CDF_RATE_VALUE,
    MAISHAPAY_CALLBACK_ENABLED,
    MAISHAPAY_GATEWAY_MODE,
} from "../lib/monetization";

export default function handler(req, res) {
    res.status(200).json({
        usdToCdfRate: USD_TO_CDF_RATE_VALUE,
        maishaPay: {
            callbackEnabled: MAISHAPAY_CALLBACK_ENABLED,
            gatewayMode: MAISHAPAY_GATEWAY_MODE,
        },
    });
}
