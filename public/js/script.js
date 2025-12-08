//Ajax for POST method
document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll(".btn-outline-dark");

    buttons.forEach(btn => {
        btn.addEventListener("click", async () => {
            const artist = btn.dataset.artist;
            const title = btn.dataset.title;
            const image_url = btn.dataset.imageUrl;

            try {
                const res = await fetch("/addToFavs", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ artist, title, image_url })
                });

                if (res.ok) {
                    btn.innerText = "Saved";

                    btn.disabled = true;
                } else {
                    alert("Error saving favorite");
                }

            } catch (err) {
                console.error("Fetch error:", err);
            }
        });
    });
});