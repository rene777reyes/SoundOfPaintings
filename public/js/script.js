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

    const searchForm = document.querySelector('form[action="/search"]');

    if (searchForm) {
        const moodInput = searchForm.querySelector('input[name="mood"]');

        let errorBox = document.createElement("div");
        errorBox.style.color = "darkred";
        errorBox.style.marginTop = "0.5rem";
        errorBox.style.fontWeight = "bold";
        errorBox.style.display = "none";
        searchForm.parentNode.insertBefore(errorBox, searchForm.nextSibling);

        const showError = (msg) => {
            errorBox.textContent = msg;
            errorBox.style.display = "block";
        };

        const clearError = () => {
            errorBox.textContent = "";
            errorBox.style.display = "none";
        };

        searchForm.addEventListener("submit", (e) => {
            if (!moodInput) {
                return; 
            }

            clearError();

            const mood = moodInput.value.trim();

            if (!mood) {
                e.preventDefault();
                showError("Please enter a mood before searching.");
                return;
            }

            const parts = mood.split(/\s+/);
            if (parts.length > 1) {
                e.preventDefault();
                showError("Please enter exactly one word for your mood.");
                return;
            }

        });

        if (moodInput) {
            moodInput.addEventListener("input", () => {
                if (errorBox.textContent) {
                    clearError();
                }
            });
        }
    }
});