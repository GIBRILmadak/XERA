export default function handler(req, res) {
    res.status(200).json({
        usdToCdfRate: 2850, // Taux configurable ici
        maishaPay: {
            callbackEnabled: true,
            gatewayMode: "1",
        },
    });
}
