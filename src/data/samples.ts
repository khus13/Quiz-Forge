export interface SampleNote {
  id: string;
  label: string;
  subject: string;
  topic: string;
  notes: string;
}

export const SAMPLE_NOTES: SampleNote[] = [
  {
    id: 'calc-ibp',
    label: 'Calculus: Integration by Parts',
    subject: 'Integral Calculus',
    topic: 'Integration by Parts',
    notes: `Integration by Parts (IBP) is derived from the Product Rule for differentiation:
d/dx [u(x)v(x)] = u(x)v'(x) + v(x)u'(x)

Integrating both sides gives the standard formula:
∫ u dv = u*v - ∫ v du

Choosing u and dv (LIATE guideline):
Priority order for choosing u:
1. Logarithmic functions (ln x, log_b x)
2. Inverse trigonometric functions (arctan x, arcsin x)
3. Algebraic functions (x^n, polynomials)
4. Trigonometric functions (sin x, cos x)
5. Exponential functions (e^x, a^x)

Whatever remains becomes dv, which must be easy to integrate.

Worked Example 1: ∫ x * e^(2x) dx
Let u = x  =>  du = dx
Let dv = e^(2x) dx  =>  v = (1/2) e^(2x)
Then ∫ x * e^(2x) dx = (1/2) x e^(2x) - ∫ (1/2) e^(2x) dx
= (1/2) x e^(2x) - (1/4) e^(2x) + C.

Worked Example 2: ∫ ln(x) dx
Let u = ln(x)  =>  du = (1/x) dx
Let dv = 1 dx  =>  v = x
Then ∫ ln(x) dx = x ln(x) - ∫ x * (1/x) dx = x ln(x) - x + C.

Definite Integrals with IBP:
∫_a^b u dv = [u*v]_a^b - ∫_a^b v du`,
  },
  {
    id: 'circuits-kvl',
    label: 'Circuits: KVL & KCL',
    subject: 'Electrical Circuits 1',
    topic: "Ohm's Law & Kirchhoff's Laws",
    notes: `Ohm's Law:
The voltage V across a resistor of resistance R (in ohms, Ω) carrying current I (in amperes, A) is:
V = I * R
Power dissipated in a resistor: P = V * I = I^2 * R = V^2 / R (in watts, W).

Series Resistors:
Total equivalent resistance: R_eq = R_1 + R_2 + ... + R_n
Current is the same through all series components.

Parallel Resistors:
1 / R_eq = 1 / R_1 + 1 / R_2 + ... + 1 / R_n
For two resistors in parallel: R_eq = (R_1 * R_2) / (R_1 + R_2)
Voltage is the same across parallel branches.

Kirchhoff's Current Law (KCL):
The algebraic sum of currents entering a node equals zero (sum of currents entering = sum of currents leaving).

Kirchhoff's Voltage Law (KVL):
The algebraic sum of all voltages around any closed loop in a circuit equals zero:
Σ V_rise = Σ V_drop.

Voltage Divider Rule (for two series resistors R_1 and R_2 across source V_s):
V_2 = V_s * [ R_2 / (R_1 + R_2) ]`,
  },
  {
    id: 'discrete-mod',
    label: 'Discrete Math: Modular Arithmetic',
    subject: 'Discrete Mathematics',
    topic: 'Modular Arithmetic & Congruences',
    notes: `Division Algorithm:
For any integer a and positive integer n, there exist unique integers q (quotient) and r (remainder) such that:
a = q*n + r, where 0 <= r < n.
We write a mod n = r.

Congruence Modulo n:
Two integers a and b are congruent modulo n, written a ≡ b (mod n), if and only if n divides (a - b), or equivalently a mod n = b mod n.

Properties of Congruences (if a ≡ b (mod n) and c ≡ d (mod n)):
1. Addition: (a + c) ≡ (b + d) (mod n)
2. Subtraction: (a - c) ≡ (b - d) (mod n)
3. Multiplication: (a * c) ≡ (b * d) (mod n)
4. Powers: a^k ≡ b^k (mod n) for positive integer k.

Modular Multiplicative Inverse:
An integer x is the modular inverse of a modulo n if:
a * x ≡ 1 (mod n)
The modular inverse exists if and only if gcd(a, n) = 1 (a and n are coprime).

Example:
Find 3^(-1) mod 7:
Test multiples of 3 mod 7: 3 * 5 = 15 = 2*7 + 1 ≡ 1 (mod 7).
Therefore, 3^(-1) ≡ 5 (mod 7).`,
  },
];
