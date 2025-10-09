# FairShare Ledger

[cloudflarebutton]

A minimalist, visually stunning web application to simplify cost-sharing for flatmates. It calculates the refund amount for a leaving member based on a linear depreciation model for shared appliances.

## Description

FairShare Ledger is a visually stunning, minimalist web application designed to simplify cost-sharing for flatmates. It calculates the refund amount for a leaving member based on a linear depreciation model for shared appliances. The application features a clean, single-page interface where users can input item details such as price, purchase date, and the total number of members. It also takes the leaving member's departure date and the agreed-upon depreciation timeline to instantly compute the fair refund amount. The result is displayed clearly, along with a transparent breakdown of the calculation, ensuring trust and clarity among users. The entire experience is designed to be intuitive, fast, and visually pleasing, turning a potentially complex calculation into a simple, elegant process.

## Key Features

-   **Instant Refund Calculation**: Quickly determine the fair refund amount for a leaving member.
-   **Linear Depreciation Model**: Uses a standard, easy-to-understand depreciation method.
-   **Transparent Breakdown**: Shows a detailed summary of how the final amount was calculated.
-   **Minimalist UI**: A clean, single-page interface that is intuitive and easy to use.
-   **Fully Responsive**: Flawless user experience across desktops, tablets, and mobile devices.
-   **Client-Side Logic**: All calculations happen in your browser; no data is ever sent to a server.

## Technology Stack

-   **Framework**: React (Vite)
-   **Styling**: Tailwind CSS
-   **UI Components**: shadcn/ui
-   **Icons**: Lucide React
-   **Form Management**: React Hook Form
-   **Validation**: Zod
-   **Animations**: Framer Motion
-   **Date Handling**: date-fns
-   **Notifications**: Sonner
-   **Deployment**: Cloudflare Pages & Workers

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

You need to have [Bun](https://bun.sh/) installed on your machine.

### Installation

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/your-username/fairshare_ledger.git
    ```
2.  **Navigate to the project directory:**
    ```sh
    cd fairshare_ledger
    ```
3.  **Install dependencies:**
    ```sh
    bun install
    ```

## Development

To run the application in development mode, use the following command. This will start a local server, typically on `http://localhost:3000`.

```sh
bun run dev
```

The application will automatically reload if you make changes to the source files.

## Deployment

This project is configured for easy deployment to Cloudflare Pages.

To deploy your application, simply run the build command followed by the deploy command:

1.  **Build the application:**
    ```sh
    bun run build
    ```
2.  **Deploy to Cloudflare:**
    ```sh
    bun run deploy
    ```

Alternatively, you can connect your GitHub repository to Cloudflare Pages for continuous deployment.

[cloudflarebutton]