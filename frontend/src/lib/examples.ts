export type SourceInput = {
  name: string;
  scope: string;
  messages: string;
};

export const examples: {
  id: string;
  title: string;
  description: string;
  category: string;
  source: SourceInput;
}[] = [
  {
    id: "lighting",
    title: "A lighting change",
    description: "Separate included lighting from a request that changes from four lights to six.",
    category: "Quantity change",
    source: {
      name: "Asha’s home renovation",
      scope: "Kitchen lighting: 3m LED strip included. Display lights excluded.",
      messages: "Asha: Could we add 4 display lights?\nDesigner: Display lights cost ₹2,000 each.\nAsha: Could we do 6? Let me check the total.\nAsha: Please remember the kitchen lighting.",
    },
  },
  {
    id: "wardrobe",
    title: "A wardrobe addition",
    description: "Identify a new storage request and the price that still needs confirming.",
    category: "Missing price",
    source: {
      name: "Fictional example: Meera’s bedroom",
      scope: "The bedroom scope includes one wardrobe with hinged laminate doors, two hanging rails, and four fixed shelves. Internal drawers and pull-out accessories are excluded.",
      messages: "Meera: Could we add three internal drawers to the wardrobe?\nDesigner: I will check the additional cost with the carpenter. No price has been confirmed yet.\nMeera: Please send the cost before I decide. I have not approved the addition.",
    },
  },
  {
    id: "finish",
    title: "A cabinet finish change",
    description: "Review a material substitution before its area and extra cost are agreed.",
    category: "Material change",
    source: {
      name: "Fictional example: Rohan’s kitchen",
      scope: "The kitchen scope includes lower and overhead cabinets with the selected matte laminate finish. Veneer finishes are excluded. The final cabinet surface measurements are pending.",
      messages: "Rohan: Could we use oak veneer on the overhead cabinet doors? Keep the lower cabinets in the agreed laminate.\nDesigner: I need to confirm the overhead door area and the additional rate with the supplier. Neither is confirmed yet.\nRohan: Please share those details first. This is a request for an option, not approval to proceed.",
    },
  },
];
