(() => {
    const networks = [
        ["airtel_money", "Airtel Money"],
        ["orange_money", "Orange Money"],
        ["mpesa", "M-Pesa / Vodacom M-Pesa"],
        ["afrimoney", "Afrimoney"],
        ["mtn_momo", "MTN MoMo"],
        ["moov_money", "Moov Money"],
        ["flooz", "Flooz"],
        ["wave", "Wave"],
        ["free_money", "Free Money"],
        ["tigo_pesa", "Tigo Pesa"],
        ["telecel_cash", "Telecel Cash"],
        ["ecocash", "EcoCash"],
        ["inwi_money", "inwi money"],
        ["e_mola", "e-Mola"],
        ["other", "Autre réseau supporté par KPay"],
    ];

    window.KPayMobileMoneyNetworks = Object.freeze(
        networks.map(([value, label]) => Object.freeze({ value, label })),
    );

    window.populateKPayMobileMoneySelect =
        function populateKPayMobileMoneySelect(select) {
            const target =
                typeof select === "string"
                    ? document.querySelector(select)
                    : select;
            if (!target) return;
            const currentValue = target.value;
            target.replaceChildren(
                ...window.KPayMobileMoneyNetworks.map(({ value, label }) => {
                    const option = document.createElement("option");
                    option.value = value;
                    option.textContent = label;
                    return option;
                }),
            );
            if (
                window.KPayMobileMoneyNetworks.some(
                    ({ value }) => value === currentValue,
                )
            ) {
                target.value = currentValue;
            }
        };
})();
